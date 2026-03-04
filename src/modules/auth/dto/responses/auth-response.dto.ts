import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({
    description: 'Short-lived JWT access token (default: 15 min). Send in Authorization: Bearer header.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Long-lived refresh token (default: 7 days). Store securely and use to rotate access tokens.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Session ID associated with this login.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  sessionId: string;
}
