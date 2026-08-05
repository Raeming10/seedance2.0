import requests
import os

url = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['ARK_API_KEY']}"
}

payload = {
    "model": "dreamina-seedance-2-0-260128",
    "content": [
                {
                    "type": "text",
                    "text": "测试视频"
                }
        ],
        "ratio": "9:16",
    "duration": 4,
    "resolution": "720p",
    "generate_audio": False
}

try:
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status 720x1280: {response.status_code}")
    print(response.text[:200])
except Exception as e:
    print(e)

payload["resolution"] = "1080p"
try:
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status 1080p: {response.status_code}")
    print(response.text[:200])
except Exception as e:
    print(e)
