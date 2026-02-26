import pandas as pd
import json

file_path = '/Users/yuvrajsharma/Downloads/Nomads Early Bird Summer Sale.xlsx'
df = pd.read_excel(file_path, sheet_name=0)
print(df.to_json(orient='records', indent=2))
