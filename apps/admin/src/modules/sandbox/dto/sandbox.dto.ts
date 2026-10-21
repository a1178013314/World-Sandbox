import { WORLD_MAX_ROUNDS, WORLD_MIN_ROUNDS } from "@ifss/shared";
import { Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class PreviewCastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  seedText!: string;

  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  castSize!: number;
}

export class ForgePackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  prompt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  castSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(WORLD_MIN_ROUNDS)
  @Max(WORLD_MAX_ROUNDS)
  totalRounds?: number;
}

export class CreateWorldDto {
  @IsOptional()
  @IsString()
  packId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  seedText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(WORLD_MIN_ROUNDS)
  @Max(WORLD_MAX_ROUNDS)
  totalRounds?: number;

  @IsDefined()
  cast!: "preset" | Record<string, unknown>[];
}

export class RunWorldDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WORLD_MAX_ROUNDS)
  rounds?: number;
}

export class InterventionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  content!: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  effectiveRound?: number;

  @IsOptional()
  @IsIn(["fact", "intent"])
  mode?: string;
}

export class ForkDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  atRound!: number;

  @IsOptional()
  @IsObject()
  intervention?: { content?: string; visibility?: string };
}

export class InterviewDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  question!: string;
}

export class CallsQueryDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class EventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  round?: number;
}
