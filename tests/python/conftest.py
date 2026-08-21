"""pytest configuration for IntelliDocs ML tests."""
import sys
import os

ml_root = os.path.join(os.path.dirname(__file__), '../../ml')
if ml_root not in sys.path:
    sys.path.insert(0, ml_root)
