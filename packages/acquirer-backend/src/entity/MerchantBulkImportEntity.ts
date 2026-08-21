import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('merchant_bulk_imports')
@Index(['key_hash'], { unique: true })
export class MerchantBulkImportEntity {
  @PrimaryGeneratedColumn()
    id!: number

  @Column({ type: 'varchar', length: 64 })
    key_hash!: string

  @Column({ type: 'varchar', length: 64 })
    request_hash!: string

  @Column({ type: 'simple-json' })
    result!: Record<string, unknown>

  @CreateDateColumn()
    created_at!: Date

  @UpdateDateColumn()
    updated_at!: Date
}
