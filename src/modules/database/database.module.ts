import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * DatabaseModule — dynamic TypeORM setup.
 * Reads all config from environment via ConfigService.
 * Switch DB engine by changing DB_TYPE in .env (postgres | mysql | sqlite).
 *
 * Usage in AppModule:
 *   imports: [DatabaseModule.forRoot()]
 */
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: config.get<'postgres' | 'mysql'>('DB_TYPE', 'postgres'),
            host: config.get<string>('DB_HOST', 'localhost'),
            port: config.get<number>('DB_PORT', 5432),
            username: config.get<string>('DB_USERNAME', 'postgres'),
            password: config.get<string>('DB_PASSWORD', 'postgres'),
            database: config.get<string>('DB_NAME', 'reusable_modules'),
            // Auto-discover all entities across all modules
            entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
            // Never synchronize in production — use migrations
            synchronize: config.get<string>('NODE_ENV') !== 'production',
            migrationsRun: config.get<string>('NODE_ENV') === 'production',
            migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
            logging: config.get<string>('NODE_ENV') === 'development',
            ssl:
              config.get<string>('DB_SSL') === 'true'
                ? { rejectUnauthorized: false }
                : false,
            extra: {
              // Connection pool settings
              max: config.get<number>('DB_POOL_MAX', 10),
              idleTimeoutMillis: 30000,
            },
          }),
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
