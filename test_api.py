import requests
import os
import json
import time

url = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['ARK_API_KEY']}"
}

def test_role(role_name):
    payload = {
        "model": "dreamina-seedance-2-0-260128",
        "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://images.pdimagearchive.org/essays/propagating-propaganda/aquaticlife219161917baus_0195-edit.jpg?width=158&height=80"},
                        "role": "first_frame"
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://images.pdimagearchive.org/essays/propagating-propaganda/aquaticlife219161917baus_0195-edit.jpg?width=158&height=80"},
                        "role": role_name
                    },
                    {
                        "type": "text",
                        "text": "测试视频"
                    }
        ],
        "ratio": "16:9",
        "duration": 4,
        "resolution": "720p",
        "generate_audio": False
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        return response.status_code, response.text
    except Exception as e:
        return 0, str(e)

roles = ["reference_image", "character", "style_reference", "image_reference", "reference", "character_reference"]
for r in roles:
    status, text = test_role(r)
    print(f"Role '{r}': Status {status}")
    if status != 200:
        print(text[:200])
    time.sleep(1)

