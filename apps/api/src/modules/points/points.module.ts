import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { DirectusModule } from '../directus/directus.module';
import { PointsDirectusService } from './points-directus.service';
import { PointsController } from './points.controller';

// Sprint 4.5/3: leaderboard reads point_awards aggregates from Directus.
// Award-on-attend is handled by the Directus flow (Sprint 3 C3.3) — no
// longer a NestJS service call. Drizzle stays only for the join with
// platform.users for display fields.

@Module({
  imports: [DirectusModule],
  providers: [{ provide: DB, useValue: db }, PointsDirectusService],
  controllers: [PointsController],
  exports: [PointsDirectusService],
})
export class PointsModule {}
