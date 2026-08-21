import path from 'path'
import multer from 'multer'
import { type NextFunction, type Request, type Response } from 'express'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      callback(new Error('Only XLSX files are allowed'))
      return
    }
    callback(null, true)
  }
}).single('file')

export function merchantWorkbookUpload (
  req: Request,
  res: Response,
  next: NextFunction
): void {
  upload(req, res, error => {
    if (error == null) {
      next()
      return
    }

    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Workbook cannot exceed 5 MB'
      : error.message
    res.status(400).send({ message })
  })
}
