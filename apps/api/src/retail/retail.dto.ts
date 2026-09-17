import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @Min(-10000)
  @Max(10000)
  @NotEquals(0)
  delta!: number;
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason!: string;
}

export class CreateSaleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  storeProductId!: string;
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}
