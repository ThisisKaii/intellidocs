from setuptools import setup, find_packages

setup(
    name="intellidocs-ml",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "fastapi==0.104.1",
        "uvicorn==0.24.0",
        "scikit-learn==1.3.2",
        "torch==2.1.0",
        "numpy==1.24.3",
        "pandas==2.1.1",
    ],
)
