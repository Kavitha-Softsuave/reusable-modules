import { Global, Module } from '@nestjs/common';

/**
 * SharedModule — interfaces, decorators, and utils only.
 * No business logic. Acts as the contract layer.
 * Marked @Global so it doesn't need to be imported in every module.
 */
@Global()
@Module({})
export class SharedModule {}
