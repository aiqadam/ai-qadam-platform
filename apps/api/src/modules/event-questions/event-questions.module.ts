import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EventQuestionsController } from './event-questions.controller';
import { EventQuestionsService } from './event-questions.service';

// F-WebU12 — per-event Q&A. Customer reads go straight to Directus
// (Public policy filtered to status=published); only writes route
// through this module.

@Module({
  imports: [AuthModule, DirectusModule],
  providers: [EventQuestionsService],
  controllers: [EventQuestionsController],
})
export class EventQuestionsModule {}
