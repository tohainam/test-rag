import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { PersonalTokensService } from '../../personal-tokens/personal-tokens.service';
import { User } from '../../database/schema';

@Injectable()
export class PersonalTokenStrategy extends PassportStrategy(
  Strategy,
  'personal-token',
) {
  constructor(private personalTokensService: PersonalTokensService) {
    super();
  }

  async validate(token: string): Promise<User> {
    return this.personalTokensService.validateToken(token);
  }
}
