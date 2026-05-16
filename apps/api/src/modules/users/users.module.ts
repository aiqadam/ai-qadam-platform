import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  providers: [{ provide: DB, useValue: db }, UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
