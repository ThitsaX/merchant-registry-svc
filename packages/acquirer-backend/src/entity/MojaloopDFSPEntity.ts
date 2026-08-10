import {
  Entity, Index,
  PrimaryGeneratedColumn, Column
} from 'typeorm'
@Entity('mojaloopDfsps')
@Index(['dfsp_id'], { unique: true })
export class MojaloopDFSPEntity {
  @PrimaryGeneratedColumn()
    id!: number

  @Column({ nullable: false, length: 255 })
    dfsp_id!: string

  @Column({ nullable: false, length: 255 })
    dfsp_name!: string
}
