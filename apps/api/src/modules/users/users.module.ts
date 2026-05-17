import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { DirectusModule } from '../directus/directus.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DirectusModule],
  providers: [{ provide: DB, useValue: db }, UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
