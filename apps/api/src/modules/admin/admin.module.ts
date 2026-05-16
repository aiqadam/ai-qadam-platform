import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminController],
  providers: [{ provide: DB, useValue: db }, AdminService],
})
export class AdminModule {}
