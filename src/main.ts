import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';

const vercelPreviewOriginPattern =
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;
const ecpayAllowedOrigins = new Set([
  'https://payment-stage.ecpay.com.tw',
  'https://payment.ecpay.com.tw',
  'https://gpayment-stage.ecpay.com.tw',
  'https://gpayment.ecpay.com.tw',
]);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuredOrigins = (
    process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(express.urlencoded({ extended: true }));
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        configuredOrigins.includes(origin) ||
        vercelPreviewOriginPattern.test(origin) ||
        ecpayAllowedOrigins.has(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
