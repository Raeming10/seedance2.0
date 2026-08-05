import requests
import os

url = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['ARK_API_KEY']}"
}

def test_without_first_frame(role_name):
    payload = {
        "model": "dreamina-seedance-2-0-260128",
        "content": [
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
        print(f"Role '{role_name}': {response.status_code} - {response.text[:200]}")
    except Exception as e:
        print(e)

test_without_first_frame("reference_image")
