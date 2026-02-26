const xlsx = require('xlsx');
const fs = require('fs');

const filePath = '/Users/yuvrajsharma/Downloads/Nomads Early Bird Summer Sale.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

fs.writeFileSync('parsed_excel.json', JSON.stringify(data, null, 2));
console.log('Success');
