import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { UsersService } from './users.service';

@Module({
  providers: [{ provide: DB, useValue: db }, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
