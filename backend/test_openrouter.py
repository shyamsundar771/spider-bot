
import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    print("ERROR: OPENROUTER_API_KEY was not loaded from .env")
    raise SystemExit(1)

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

print("\n--- Checking OpenRouter API key and account limits ---")

try:
    response = requests.get(
        "https://openrouter.ai/api/v1/key",
        headers=headers,
        timeout=20,
    )
    print("Key status:", response.status_code)

    try:
        data = response.json()
        if response.ok:
            info = data.get("data", {})
            print("Account limits:")
            print("  Remaining credits:", info.get("limit_remaining"))
            print("  Free requests remaining:",
                  info.get("free_model_daily_requests", {}).get("remaining"))
        else:
            print("Key endpoint error:", data)
    except ValueError:
        print("Response:", response.text[:1000])

except requests.RequestException as exc:
    print("Key check failed:", exc)


print("\n--- Testing Spider Bot model ---")

payload = {
    "model": "openrouter/free",
    "messages": [
        {"role": "user", "content": "Reply with: Spider Bot test successful"}
    ],
    "stream": False,
}

try:
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=90,
    )

    print("Model status:", response.status_code)

    try:
        result = response.json()
        if response.ok:
            print("Model reply:")
            print(result["choices"][0]["message"]["content"])
        else:
            print("OpenRouter error details:")
            print(result)
    except (ValueError, KeyError, IndexError):
        print("Response:", response.text[:2000])

except requests.RequestException as exc:
    print("Model request failed:", exc)