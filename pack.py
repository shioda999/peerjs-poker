import os
import zipfile
from datetime import datetime

def zip_current_directory(zip_filename, ignore_patterns=None):
    if ignore_patterns is None:
        ignore_patterns = []

    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # 無視するディレクトリを除外
            dirs[:] = [d for d in dirs if not any(pattern in d for pattern in ignore_patterns)]

            for file in files:
                file_path = os.path.join(root, file)
                arc_path = os.path.relpath(file_path, '.')
                # 無視するファイルを除外
                # print(file_path, arc_path, any(pattern in file for pattern in ignore_patterns))
                if any(pattern in arc_path for pattern in ignore_patterns):
                    continue

                zipf.write(file_path, arc_path)

if __name__ == '__main__':
    # 無視するパターンを指定
    ignore_patterns = [
        'venv',
        'backup'
    ]

    current_time = datetime.now().strftime("%Y%m%d_%H_%M")
    os.makedirs("backup", exist_ok=True)
    zip_filename = f'backup/backup_{current_time}.zip'
    zip_current_directory(zip_filename, ignore_patterns)
    print(f"ZIPファイルを作成しました: {zip_filename}")