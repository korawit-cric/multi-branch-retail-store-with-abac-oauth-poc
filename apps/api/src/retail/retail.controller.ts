import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { SessionService } from '../auth/session.service';
import { RetailService } from './retail.service';
import { AdjustStockDto, CreateSaleDto } from './retail.dto';

@Controller('retail')
export class RetailController {
  constructor(
    private readonly sessions: SessionService,
    private readonly retail: RetailService,
  ) {}
  @Get()
  async dashboard(@Headers('cookie') cookie?: string) {
    return this.retail.dashboard(await this.sessions.authenticate(cookie));
  }
  private origin(origin?: string) {
    if (origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000'))
      throw new ForbiddenException('Invalid request origin');
  }
  @Post('inventory/:id/adjust')
  async adjust(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
    @Body() body: AdjustStockDto,
  ) {
    this.origin(origin);
    return this.retail.adjust(
      await this.sessions.authenticate(cookie),
      id,
      body,
    );
  }
  @Post('sales')
  async sale(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() body: CreateSaleDto,
  ) {
    this.origin(origin);
    return this.retail.sale(await this.sessions.authenticate(cookie), body);
  }
}
