import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  providers: [{ provide: DB, useValue: db }, EventsService],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
