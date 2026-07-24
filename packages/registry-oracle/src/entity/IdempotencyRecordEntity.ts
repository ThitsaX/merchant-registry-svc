import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('idempotency_records')
export class IdempotencyRecordEntity {
  @PrimaryColumn({ length: 128 })
    idempotency_key!: string

  @Column({ length: 64 })
    scope!: string

  @Column({ length: 64 })
    request_hash!: string

  @Column({ type: 'text' })
    response_body!: string

  @Column({ type: 'int' })
    status_code!: number

  @CreateDateColumn()
    created_at!: Date

  @UpdateDateColumn()
    updated_at!: Date
}
