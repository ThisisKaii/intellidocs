import nltk

def download_nltk_resources():
    print("Downloading NLTK resources...")
    resources = [
        "punkt",
        "averaged_perceptron_tagger",
        "averaged_perceptron_tagger_eng"
    ]
    for resource in resources:
        try:
            nltk.download(resource, quiet=True)
            print(f"✅ Successfully downloaded NLTK resource: {resource}")
        except Exception as e:
            print(f"❌ Failed to download NLTK resource: {resource}. Error: {e}")

if __name__ == "__main__":
    download_nltk_resources()
