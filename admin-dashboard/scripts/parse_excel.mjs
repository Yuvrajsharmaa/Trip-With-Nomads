import * as xlsx from 'xlsx';
import fs from 'fs';

const filePath = '/Users/yuvrajsharma/Downloads/Nomads Early Bird Summer Sale.xlsx';

if (fs.existsSync(filePath)) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    console.log(JSON.stringify(data, null, 2));
} else {
    console.log("File not found:", filePath);
}
