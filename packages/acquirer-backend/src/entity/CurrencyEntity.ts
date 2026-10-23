import { Entity, Column, PrimaryColumn, OneToMany, ManyToMany } from 'typeorm'
import { MerchantEntity } from './MerchantEntity'

@Entity('currencies')
export class CurrencyEntity {
  @PrimaryColumn({ length: 3 })
    iso_code!: string

  @Column({ nullable: false, length: 255 })
    description!: string

  @OneToMany(() => MerchantEntity, merchant => merchant.currency_code)
    merchants!: MerchantEntity[]

  @ManyToMany(() => MerchantEntity, merchant => merchant.currencies)
    accepting_merchants!: MerchantEntity[]
}
