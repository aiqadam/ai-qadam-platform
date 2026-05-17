import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { DirectusUsersBridgeService } from './directus-users-bridge.service';
import { DirectusClient } from './directus.client';

@Module({
  providers: [{ provide: DB, useValue: db }, DirectusClient, DirectusUsersBridgeService],
  exports: [DirectusClient, DirectusUsersBridgeService],
})
export class DirectusModule {}
