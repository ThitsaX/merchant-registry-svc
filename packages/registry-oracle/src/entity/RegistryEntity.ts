import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm'

@Entity('registry')
@Index(['merchant_id', 'checkout_counter_id'], { unique: true })
@Index(['alias_value'], { unique: true })
@Index(['lei'])
export class RegistryEntity {
  @PrimaryGeneratedColumn()
    id!: number

  @Column({ nullable: true })
    merchant_id!: number

  @Column({ nullable: false })
    fspId!: string

  @Column({ nullable: true })
    dfsp_name!: string

  @Column({ nullable: true })
    checkout_counter_id?: number

  @Column({ nullable: false, default: 'MERCHANT_PAYINTOID' })
    alias_type!: string

  @Column({ nullable: false, length: 32 })
    alias_value!: string

  @Column({ nullable: false, default: false })
    is_incremental_head!: boolean

  @Column({ nullable: false })
    currency!: string

  @Column({ nullable: true })
    lei?: string

  @CreateDateColumn()
    created_at!: Date

  @UpdateDateColumn()
    updated_at!: Date
}
