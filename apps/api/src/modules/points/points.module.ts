import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Module({
  providers: [{ provide: DB, useValue: db }, PointsService],
  controllers: [PointsController],
  exports: [PointsService],
})
export class PointsModule {}
