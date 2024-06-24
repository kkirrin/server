import { BotService } from './bot/bot.service';
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  constructor(private readonly BotService: BotService) {}

  @Get('/reputations')
    async getReputations() {
      // Это будет возвращаться на клиент
      const reputations = await this.BotService.getAllReputations();
      return reputations.sort((a, b) => b.reputation - a.reputation); 
    } 
}
