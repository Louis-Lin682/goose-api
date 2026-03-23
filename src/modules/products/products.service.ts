import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { INITIAL_PRODUCT_CATALOG } from './product-catalog';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export type ProductEntry = {
  id: string;
  category: string;
  categoryOrder: number;
  subCategory: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  priceSmall: number | null;
  priceLarge: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductsResponse = {
  products: ProductEntry[];
};

export type CreateProductResponse = {
  message: string;
  product: ProductEntry;
};

export type UpdateProductResponse = {
  message: string;
  product: ProductEntry;
};

export type DeleteProductResponse = {
  message: string;
};

export type UpdateCategoryOrderPayload = {
  category: string;
  categoryOrder: number;
};

export type UpdateCategoryOrderResponse = {
  message: string;
};

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.syncInitialCatalog();
    await this.syncInitialCategoryOrder();
    await this.normalizeCategoryOrders();
  }

  async syncInitialCatalog(): Promise<void> {
    const existingCount = await this.prisma.product.count();

    if (existingCount > 0) {
      return;
    }

    for (const item of INITIAL_PRODUCT_CATALOG) {
      await this.prisma.product.create({
        data: {
          id: item.id,
          category: item.category,
          categoryOrder: item.categoryOrder,
          subCategory: item.subCategory,
          name: item.name,
          imageUrl: item.imageUrl ?? null,
          price: item.price ?? null,
          priceSmall: item.priceSmall ?? null,
          priceLarge: item.priceLarge ?? null,
          isActive: item.isActive ?? true,
          sortOrder: item.sortOrder,
        },
      });
    }
  }

  async syncInitialCategoryOrder(): Promise<void> {
    const categoryOrderMap = new Map<string, number>();

    for (const item of INITIAL_PRODUCT_CATALOG) {
      if (!categoryOrderMap.has(item.category)) {
        categoryOrderMap.set(item.category, item.categoryOrder);
      }
    }

    for (const [category, categoryOrder] of categoryOrderMap.entries()) {
      await this.prisma.product.updateMany({
        where: {
          category,
          categoryOrder: 0,
        },
        data: {
          categoryOrder,
        },
      });
    }
  }

  async getPublicProducts(): Promise<ProductsResponse> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [
        { categoryOrder: 'asc' },
        { category: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return { products };
  }

  async getAdminProducts(): Promise<ProductsResponse> {
    const products = await this.prisma.product.findMany({
      orderBy: [
        { categoryOrder: 'asc' },
        { category: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return { products };
  }

  async createProduct(
    createProductDto: CreateProductDto,
  ): Promise<CreateProductResponse> {
    const category = createProductDto.category.trim();
    const sortOrder = createProductDto.sortOrder ?? 0;
    const existingCategory = await this.prisma.product.findFirst({
      where: { category },
      select: { categoryOrder: true },
    });

    await this.ensureUniqueSortOrder(category, sortOrder);

    const product = await this.prisma.$transaction(async (tx) => {
      if (existingCategory) {
        return tx.product.create({
          data: {
            id: this.createProductId(),
            category,
            categoryOrder: existingCategory.categoryOrder,
            subCategory: createProductDto.subCategory.trim(),
            name: createProductDto.name.trim(),
            imageUrl: createProductDto.imageUrl?.trim() || null,
            price: createProductDto.price ?? null,
            priceSmall: createProductDto.priceSmall ?? null,
            priceLarge: createProductDto.priceLarge ?? null,
            isActive: true,
            sortOrder,
          },
        });
      }

      const nextCategoryOrder = await this.getNextCategoryOrder(tx);
      const requestedOrder = createProductDto.categoryOrder ?? nextCategoryOrder;
      const categoryOrder = Math.min(Math.max(requestedOrder, 1), nextCategoryOrder);

      await tx.product.updateMany({
        where: {
          categoryOrder: {
            gte: categoryOrder,
          },
        },
        data: {
          categoryOrder: {
            increment: 1,
          },
        },
      });

      return tx.product.create({
        data: {
          id: this.createProductId(),
          category,
          categoryOrder,
          subCategory: createProductDto.subCategory.trim(),
          name: createProductDto.name.trim(),
          imageUrl: createProductDto.imageUrl?.trim() || null,
          price: createProductDto.price ?? null,
          priceSmall: createProductDto.priceSmall ?? null,
          priceLarge: createProductDto.priceLarge ?? null,
          isActive: true,
          sortOrder,
        },
      });
    });

    await this.normalizeCategoryOrders();

    return {
      message: '???啣???',
      product,
    };
  }

  async updateProduct(
    productId: string,
    updateProductDto: UpdateProductDto,
  ): Promise<UpdateProductResponse> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found.');
    }

    const nextCategory = updateProductDto.category?.trim() ?? existingProduct.category;
    const nextSortOrder = updateProductDto.sortOrder ?? existingProduct.sortOrder;
    const isSameCategory = nextCategory === existingProduct.category;

    if (!isSameCategory) {
      await this.ensureUniqueSortOrder(nextCategory, nextSortOrder, productId);
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const duplicatedProduct =
        isSameCategory && nextSortOrder !== existingProduct.sortOrder
          ? await tx.product.findFirst({
              where: {
                category: nextCategory,
                sortOrder: nextSortOrder,
                id: {
                  not: productId,
                },
              },
              select: {
                id: true,
              },
            })
          : null;

      if (duplicatedProduct) {
        await tx.product.update({
          where: { id: duplicatedProduct.id },
          data: {
            sortOrder: existingProduct.sortOrder,
          },
        });
      }

      const existingTargetCategory =
        nextCategory !== existingProduct.category
          ? await tx.product.findFirst({
              where: { category: nextCategory },
              select: { categoryOrder: true },
            })
          : null;

      return tx.product.update({
        where: { id: productId },
        data: {
          category: updateProductDto.category?.trim(),
          categoryOrder:
            updateProductDto.category?.trim() && existingTargetCategory
              ? existingTargetCategory.categoryOrder
              : updateProductDto.categoryOrder,
          subCategory: updateProductDto.subCategory?.trim(),
          name: updateProductDto.name?.trim(),
          imageUrl:
            updateProductDto.imageUrl === undefined
              ? undefined
              : updateProductDto.imageUrl?.trim() || null,
          price: updateProductDto.price ?? undefined,
          priceSmall: updateProductDto.priceSmall ?? undefined,
          priceLarge: updateProductDto.priceLarge ?? undefined,
          sortOrder: updateProductDto.sortOrder,
        },
      });
    });

    return {
      message: '???湔??',
      product,
    };
  }

  async updateCategoryOrder(
    payload: UpdateCategoryOrderPayload,
  ): Promise<UpdateCategoryOrderResponse> {
    const category = payload.category.trim();
    const targetOrder = payload.categoryOrder;

    const currentCategory = await this.prisma.product.findFirst({
      where: { category },
      select: { categoryOrder: true },
    });

    if (!currentCategory) {
      throw new NotFoundException('Category not found.');
    }

    if (currentCategory.categoryOrder === targetOrder) {
      return {
        message: '?????湔??',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      const temporaryOrder = -999999;
      const categoryToSwap = await tx.product.findFirst({
        where: {
          categoryOrder: targetOrder,
          category: {
            not: category,
          },
        },
        select: {
          category: true,
        },
      });

      await tx.product.updateMany({
        where: {
          category,
        },
        data: {
          categoryOrder: temporaryOrder,
        },
      });

      if (categoryToSwap) {
        await tx.product.updateMany({
          where: {
            category: categoryToSwap.category,
          },
          data: {
            categoryOrder: currentCategory.categoryOrder,
          },
        });
      }

      await tx.product.updateMany({
        where: {
          category,
        },
        data: {
          categoryOrder: targetOrder,
        },
      });
    });

    return {
      message: '?????湔??',
    };
  }

  async deleteProduct(productId: string): Promise<DeleteProductResponse> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found.');
    }

    await this.prisma.product.delete({
      where: { id: productId },
    });

    return {
      message: '???芷??',
    };
  }

  async deleteCategory(categoryName: string): Promise<DeleteProductResponse> {
    const category = decodeURIComponent(categoryName).trim();

    const existingCategory = await this.prisma.product.findFirst({
      where: { category },
      select: { id: true, categoryOrder: true },
    });

    if (!existingCategory) {
      throw new NotFoundException('??????????');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.deleteMany({
        where: { category },
      });

      await tx.product.updateMany({
        where: {
          categoryOrder: {
            gt: existingCategory.categoryOrder,
          },
        },
        data: {
          categoryOrder: {
            decrement: 1,
          },
        },
      });
    });

    return {
      message: '???????????',
    };
  }

  private async ensureUniqueSortOrder(
    category: string,
    sortOrder: number,
    excludeProductId?: string,
  ): Promise<void> {
    const duplicatedProduct = await this.prisma.product.findFirst({
      where: {
        category,
        sortOrder,
        ...(excludeProductId
          ? {
              id: {
                not: excludeProductId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!duplicatedProduct) {
      return;
    }

    throw new BadRequestException(`Sort order ${sortOrder} is already used in category "${category}".`);
  }

  private async normalizeCategoryOrders(): Promise<void> {
    const products = await this.prisma.product.findMany({
      select: {
        category: true,
        categoryOrder: true,
        createdAt: true,
      },
      orderBy: [
        { categoryOrder: 'asc' },
        { createdAt: 'asc' },
        { category: 'asc' },
      ],
    });

    const orderedCategories: string[] = [];
    const seenCategories = new Set<string>();

    for (const product of products) {
      if (seenCategories.has(product.category)) {
        continue;
      }

      seenCategories.add(product.category);
      orderedCategories.push(product.category);
    }

    for (const [index, category] of orderedCategories.entries()) {
      await this.prisma.product.updateMany({
        where: { category },
        data: { categoryOrder: index + 1 },
      });
    }
  }

  private async getNextCategoryOrder(
    prisma: Pick<PrismaService, 'product'> = this.prisma,
  ): Promise<number> {
    const lastCategory = await prisma.product.findFirst({
      orderBy: [{ categoryOrder: 'desc' }],
      select: { categoryOrder: true },
    });

    return (lastCategory?.categoryOrder ?? 0) + 1;
  }

  private createProductId(): string {
    return `p_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
}


