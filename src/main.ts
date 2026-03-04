import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CLIENT_URL ?? '*',
    credentials: true,
  });

  // ─── Swagger ─────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Reusable Modules API')
    .setDescription(
      'NestJS monorepo with self-contained, plug-and-play modules.\n\n' +
        '**Auth flow:**\n' +
        '1. `POST /auth/register` or `POST /auth/login` → receive `accessToken` + `refreshToken`\n' +
        '2. Add `Authorization: Bearer <accessToken>` header to protected routes\n' +
        '3. When the access token expires (15 min), call `POST /auth/refresh` with the refresh token\n' +
        '4. `POST /auth/logout` to revoke the current session\n\n' +
        '**Google OAuth2 flow:** Open `GET /auth/google` in a browser — not usable from Swagger UI.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `accessToken` from login/register here.',
      },
      'Bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keeps the token across page refreshes
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Reusable Modules — API Docs',
  });
  // ─────────────────────────────────────────────────────────────────────────────

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on:  http://localhost:${port}`);
  console.log(`Swagger docs available:  http://localhost:${port}/docs`);
}
bootstrap();
