---
name: pydantic-converter
description: Use when writing or editing any FastAPI endpoint in ml/src/. Helps keep FastAPI request/response models properly validated with Pydantic, mirroring the same discipline already enforced by Zod on the TypeScript side.
---

# Pydantic Model Standards for IntelliDocs ML Service

This skill guides data validation for the Python FastAPI microservice located in `ml/src/`.

## Core Guidelines

1. **Boundary Validation**: Every request body passed to FastAPI endpoints MUST be a Pydantic `BaseModel`.
2. **Explicit Response Models**: Every route in `ml/src/main.py` MUST define an explicit `response_model` parameter.
3. **Type Annotation Discipline**:
   - Use standard Python type hints (`str`, `int`, `float`, `bool`, `list`, `dict`, `Optional`).
   - Use `Field(..., description="...")` for external documentation and clarity.
4. **Mirror Zod Types**:
   - TypeScript Zod schemas live in `server/schemas/` and `frontend/src/schemas/`.
   - Pydantic models in `ml/src/` must mirror fields 1-to-1 when exchanging data via `pythonBridge.ts`.

## Standard Patterns

```python
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class PredictRequest(BaseModel):
    text: str = Field(..., description="Text segment to predict formatting for")
    user_id: Optional[str] = Field(None, description="Optional Supabase user UUID for sequence prediction")

class PredictResponse(BaseModel):
    predicted_format: str = Field(..., description="Predicted formatting class (e.g. bold, heading1, paragraph)")
    confidence: float = Field(..., description="Combined hybrid confidence score between 0.0 and 1.0")
    model_path: str = Field(..., description="Path to the primary model payload used")
    feature_values: Dict[str, float] = Field(default_factory=dict, description="Extracted numerical features")
```

## Checklist for FastAPI Routes
- [ ] Route uses `response_model=MyResponseModel` in `@app.post(...)` decorator.
- [ ] Request parameters use `request: MyRequestModel`.
- [ ] Non-empty text fields validated or stripped.
- [ ] Appropriate HTTP status codes (`HTTPException(status_code=400, detail=...)` for validation errors, `500` for runtime/model loading issues).
- [ ] Response matches the response model shape strictly.
