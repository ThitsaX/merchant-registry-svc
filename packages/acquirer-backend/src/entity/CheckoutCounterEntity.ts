import {
  Entity, Column, PrimaryGeneratedColumn, Index,
  ManyToOne,
  CreateDateColumn, UpdateDateColumn
} from 'typeorm'
import { MerchantEntity } from './MerchantEntity'
import { MerchantLocationEntity } from './MerchantLocationEntity'

@Entity('checkout_counters')
export class CheckoutCounterEntity {
  @PrimaryGeneratedColumn()
    id!: number

  @Column({ nullable: false, default: 1 })
    counter_number!: number

  @Column({ nullable: true, length: 255 })
    description!: string

  @Column({ nullable: true, length: 512 })
    guid!: string

  @Column({ nullable: true, length: 255 })
    notification_number!: string

  @Column({ nullable: false, length: 255, default: 'MERCHANT_PAYINTOID' })
    alias_type!: string

  @Column({ type: 'varchar', nullable: true, length: 255 })
    alias_value!: string | null

  @Column({ nullable: true })
    merchant_registry_id!: number

  @Column({ nullable: true })
    qr_code_link!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true, length: 64 })
    creation_idempotency_key_hash!: string | null

  @Column({ type: 'varchar', nullable: true, length: 64 })
    creation_request_hash!: string | null

  // merchant_id
  @ManyToOne(
    () => MerchantEntity, merchant => merchant.checkout_counters,
    { onDelete: 'SET NULL' }
  )
    merchant!: MerchantEntity

  // merchant_location_id
  @ManyToOne(
    () => MerchantLocationEntity,
    merchantLocation => merchantLocation.checkout_counters,
    { onDelete: 'SET NULL' }
  )
    checkout_location!: MerchantLocationEntity

  @CreateDateColumn()
    created_at!: Date

  @UpdateDateColumn()
    updated_at!: Date
}
