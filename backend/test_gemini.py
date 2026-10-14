
import os
from dotenv import load_dotenv
from google import genai

# Load environment variables from .env
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError(
        "GEMINI_API_KEY not found. Check your backend/.env file."
    )

# Initialize Gemini
client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents="Introduce yourself as Spider Bot in one sentence.",
    )

    print("\nSpider Bot response:")
    print(response.text)

except Exception as error:
    print("\nGemini request failed.")
    print("Error type:", type(error).__name__)
    print("Details:", str(error))