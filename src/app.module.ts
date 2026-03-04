import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './modules/database/database.module';
import { SharedModule } from './modules/shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    // Config — loads .env, available globally via ConfigService
    ConfigModule.forRoot({ isGlobal: true }),

    // Event bus — modules communicate via events, never direct imports
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),

    // Dynamic TypeORM connection (reads DB_* vars from .env)
    DatabaseModule.forRoot(),

    SharedModule,
    AuthModule,
    // Add more feature modules here (RolesModule, NotificationsModule, PaymentModule…)
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT guard — every route requires auth unless decorated @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global validation — strips unknown fields, transforms types
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
