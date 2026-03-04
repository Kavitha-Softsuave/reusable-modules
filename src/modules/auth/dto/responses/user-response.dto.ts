import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider } from '../../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiPropertyOptional({ example: '115234567890123456789', nullable: true })
  googleId: string | null;

  @ApiProperty({ enum: AuthProvider, example: AuthProvider.LOCAL })
  provider: AuthProvider;

  @ApiProperty({ example: '2026-03-04T06:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-03-04T06:00:00.000Z' })
  updatedAt: Date;
}
