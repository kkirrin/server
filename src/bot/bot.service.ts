import TelegramBot = require('node-telegram-bot-api');
import { Injectable, OnModuleInit, Controller } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { Prisma, Reputation } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.botMessage();
  }

  async botMessage() {
    const bot = new TelegramBot(process.env.TELEGRAM_API_KEY, { polling: true });
    const thanksWords = [
      'спасибо',
      'спс',
      'благодарю',
      'заработало',
      'сработало',
      '👍',
    ];

    // Обработчик для новых участников чата
    bot.on('new_chat_members', (msg) =>
      bot.sendMessage(
        msg.chat.id,
        `Привет, ${msg.new_chat_members[0].first_name}! Теперь ты в дурке...`,
      ),
    );
    
    bot.on(
      'left_chat_member',
      async (msg) =>
        await this.removeReputation(String(msg.left_chat_member.id)),
    );

    // Слушает ошибки
    bot.on('polling_error', (error) => {
      console.log(error); 
    });

    // Обработчик для всех сообщений
    bot.on('message', async (msg) => {
      if (msg?.reply_to_message) {
        const user = await bot.getChatMember(
          msg.chat.id,
          msg.reply_to_message.from.id,
        );

        // Если пользователь покинул чат
        if (user.status === 'left') {
          bot.sendMessage(msg.chat.id, 'Нас покинул человек');
          return;
        }
        // Обработка стикеров
        if (msg?.sticker) {
          if (msg.sticker.emoji === '👍') {
            bot.sendMessage(msg.chat.id, 'Кто то кого то похвалил. Репутация увеличена');
            this.handleChangeReaction(msg, bot, 'thanks');
          }
          if (msg.sticker.emoji === '👎') {
            bot.sendMessage(msg.chat.id, 'Палец вниз. Репутация будет снижена');
            this.handleChangeReaction(msg, bot, 'unthanks');
          }

          return;
        }

        if (
          msg.reply_to_message.from.username === 'MainBotKkirrin' ||
          msg.reply_to_message.from.username === msg.from.username
        ) {
          return;
        }
          
        const thanksWord = msg.text
        .toLowerCase()
        .split(' ')
        .find((word) =>
          thanksWords.includes(
            word.replace(/[&\/\\#,+()$~%.'":*?!<>{}]/g, ''),
          ),
        );
          
        if (thanksWord) {
          this.handleChangeReaction(msg, bot, 'thanks');
        }
      }
    });
  }

  async removeReputation(telegramId: string) {
    const user = await this.prisma.reputation.findFirst({
      where: { telegramId },
    });

    if (user) {
      await this.prisma.reputation.delete({ where: { id: user.id } });
    }
  }

  
  async getAllReputations(): Promise<Reputation[]> {
    return await this.prisma.reputation.findMany();
  }

  
  async sendReputationMessage(
    chatId: number,
    replyUsername: string,
    fromUsername: string,
    bot: TelegramBot,
    telegramId: string,
  ) {
    const reputationData = await this.getReputation(telegramId);

    bot.sendMessage(
      chatId,
      `Внимание, ${replyUsername}! Участник ${fromUsername} изменил твою репутацию! Теперь твоя репутация ${reputationData.reputation}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Статистика чата',
                url: 'https://skill-bot-client.vercel.app',
              },
            ],
          ],
        },
      },
    );
  }

   async getReputation(telegramId: string): Promise<Reputation> {
    return await this.prisma.reputation.findFirst({
      where: { telegramId },
    });
  }

  async updateReputation(reputation: number, id: number): Promise<void> {
    await this.prisma.reputation.update({
      where: { id },
      data: { reputation },
    });
  }


 
  async increaseReputation(
    telegramId: string,
    username: string,
    fullname: string,
    userAvatar: string,
  ) {
    const reputationData = await this.getReputation(telegramId);

    if (reputationData) {
      await this.updateReputation(
        reputationData.reputation + 1,
        reputationData.id,
      );
      return;
    }

    await this.addNewReputation({
      telegramId,
      username,
      userAvatar,
      fullname,
      reputation: 1,
    });
  }
  async decreaseReputation(
    telegramId: string,
    username: string,
    fullname: string,
    userAvatar: string,
  ) {
    const reputationData = await this.getReputation(telegramId);

    if (reputationData) {
      await this.updateReputation(
        reputationData.reputation - 1,
        reputationData.id,
      );
      return;
    }

    await this.addNewReputation({
      telegramId,
      username,
      userAvatar,
      fullname,
      reputation: 1,
    });
  }

  
  
  // Методя для создания новой записи в бд для репутации
  async addNewReputation(data: Prisma.ReputationCreateInput): Promise<void> {
    await this.prisma.reputation.create({
      data
    })
  }


  async handleChangeReaction(msg: TelegramBot.Message, bot: TelegramBot, reaction? : String) {
    const telegramId = String(msg.reply_to_message.from.id);
    const userAvatar = await this.getUserAvatarUrl(
      msg.reply_to_message.from.id,
      bot,
    );


    if( reaction === 'thanks') {

      await this.increaseReputation(
        telegramId,
        msg.reply_to_message.from?.username
        ? msg.reply_to_message.from.username
        : '',
        `${msg.reply_to_message.from?.first_name} ${msg.reply_to_message.from?.last_name}`,
        userAvatar,
      );
    }

    if (reaction === 'unthanks') {
      await this.decreaseReputation(
        telegramId,
        msg.reply_to_message.from?.username
        ? msg.reply_to_message.from.username
        : '',
        `${msg.reply_to_message.from?.first_name} ${msg.reply_to_message.from?.last_name}`,
        userAvatar,
      );
    }

    await this.sendReputationMessage(
      msg.chat.id,
      `${msg.reply_to_message.from.first_name} ${
        msg.reply_to_message.from?.username
          ? `(@${msg.reply_to_message.from?.username})`
          : ''
      }`,
      msg.from.first_name,
      bot,
      telegramId,
    );
  }


  async getUserAvatarUrl(userId: number, bot: TelegramBot) {
    const userProfile = await bot.getUserProfilePhotos(userId);

    if (!userProfile.photos.length) {
      return '';
    }

    const fileId = userProfile.photos[0][0].file_id;
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;

    return `https://api.telegram.org/file/bot${process.env.TELEGRAM_API_KEY}/${filePath}`;
  }
}
