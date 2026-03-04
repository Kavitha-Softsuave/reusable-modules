import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { User } from '../entities/user.entity';

/**
 * @CurrentUser() — injects the authenticated user from req.user.
 *
 * Usage:
 *   @CurrentUser() user: User & { sessionId: string }
 *   @CurrentUser('email') email: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof (User & { sessionId: string }) | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as User & { sessionId: string };
    return field ? user?.[field] : user;
  },
);
