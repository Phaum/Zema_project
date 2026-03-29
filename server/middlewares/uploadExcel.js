import multer from 'multer';

const storage = multer.memoryStorage();

const uploadExcel = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const ok =
            file.mimetype.includes('spreadsheetml') ||
            file.mimetype.includes('excel') ||
            file.originalname.toLowerCase().endsWith('.xlsx') ||
            file.originalname.toLowerCase().endsWith('.xls');

        if (!ok) {
            return cb(new Error('Разрешены только Excel-файлы'));
        }

        cb(null, true);
    },
});

export default uploadExcel;