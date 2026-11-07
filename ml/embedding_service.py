"""
IntelliDocs ML Service — Embedding Generation & Similarity Search
Handles document embedding generation using OpenAI embeddings and pgvector similarity search.
"""

import os
import re
import asyncio
from typing import List, Optional, Tuple
from dataclasses import dataclass

import openai
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

_openai_client: Optional[openai.AsyncOpenAI] = None


def _get_openai_client() -> Optional[openai.AsyncOpenAI]:
    """Build the OpenAI client lazily; None when no embedding key is configured."""
    global _openai_client
    if _openai_client is None and OPENAI_API_KEY:
        _openai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


@dataclass
class ParagraphEmbedding:
    """Represents a paragraph with its embedding."""
    document_id: str
    user_id: str
    folder_id: Optional[str]
    paragraph_index: int
    paragraph_text: str
    embedding: List[float]
    char_start: int
    char_end: int


@dataclass
class SimilarityMatch:
    """Represents a similarity match between paragraphs."""
    embedding_id: str
    document_id: str
    user_id: str
    paragraph_index: int
    paragraph_text: str
    similarity: float
    folder_id: Optional[str] = None


async def generate_embedding(text: str) -> List[float]:
    """
    Generate an embedding for the given text using OpenAI's embedding model.
    Uses text-embedding-3-small (1536 dimensions) by default.
    """
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM
    
    # Truncate if too long (max 8191 tokens for text-embedding-3-small)
    # Rough estimate: 1 token ≈ 4 chars
    max_chars = 32000
    if len(text) > max_chars:
        text = text[:max_chars]

    client = _get_openai_client()
    if client is None:
        return [0.0] * EMBEDDING_DIM

    try:
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text.strip()
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[Embedding] Failed to generate embedding: {e}")
        return [0.0] * EMBEDDING_DIM


async def generate_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts in a single API call."""
    if not texts:
        return []
    
    # Filter empty texts
    valid_texts = [t.strip() for t in texts if t and t.strip()]
    if not valid_texts:
        return [[0.0] * EMBEDDING_DIM] * len(texts)

    client = _get_openai_client()
    if client is None:
        return [[0.0] * EMBEDDING_DIM] * len(texts)

    try:
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=valid_texts
        )
        # Map back to original positions
        embeddings = {}
        for i, text in enumerate(texts):
            if text and text.strip():
                embeddings[i] = response.data[list(embeddings.keys()).index(i)].embedding if i in [j for j, t in enumerate(texts) if t and t.strip()] else response.data[valid_texts.index(text.strip())].embedding
            else:
                embeddings[i] = [0.0] * EMBEDDING_DIM
        
        return [embeddings.get(i, [0.0] * EMBEDDING_DIM) for i in range(len(texts))]
    except Exception as e:
        print(f"[Embedding] Batch generation failed: {e}")
        return [[0.0] * EMBEDDING_DIM] * len(texts)


_MATTER_HEADING = re.compile(
    r"^(table of contents|contents|list of (figures|tables|abbreviations)|acknowledg\w*|dedication"
    r"|abstract|preface|foreword|references|bibliography|works cited|literature cited"
    r"|appendix|appendices|index)\b"
)
_HEADING_NUMBER = re.compile(r"^((chapter|section|part)\s+)?(([ivxlcdm]+|\d+(\.\d+)*|[a-z])[\s.:)\-]+)?")


def _is_matter_heading(text: str) -> bool:
    """True for front/back-matter headings (TOC, abstract, references, ...), ignoring numbering."""
    normalized = " ".join(text.lower().split())
    return bool(_MATTER_HEADING.match(normalized) or _MATTER_HEADING.match(_HEADING_NUMBER.sub("", normalized, count=1)))


def extract_paragraphs(html_content: str, min_length: int = 50) -> List[Tuple[int, str, int, int]]:
    """
    Extract paragraphs from HTML content.
    Returns list of (paragraph_index, text, char_start, char_end).
    Skips front/back matter (title, TOC, references).
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_content, 'html.parser')

    headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    blocks = ['p', 'div', 'blockquote', 'li', 'td', 'th']

    paragraphs = []
    char_pos = 0
    para_index = 0
    # Level of the front/back-matter heading whose section we are in, or None.
    # A heading is a sibling of its section's paragraphs, not their parent, so
    # the section is tracked while walking the document in order.
    matter_level = None

    for elem in soup.find_all(headings + blocks):
        if elem.name in headings:
            level = int(elem.name[1])
            if _is_matter_heading(elem.get_text(' ', strip=True)):
                if matter_level is None or level <= matter_level:
                    matter_level = level
            elif matter_level is not None and level <= matter_level:
                matter_level = None
            continue

        if matter_level is not None:
            continue

        # Containers holding other blocks are represented by those blocks, so
        # nested text (li > p, td > p, div > p) is only extracted once.
        if elem.find(blocks) is not None:
            continue

        text = elem.get_text(' ', strip=True)
        if len(text) < min_length:
            continue

        # Find character positions in original HTML
        elem_html = str(elem)
        start_pos = html_content.find(elem_html, char_pos)
        if start_pos == -1:
            start_pos = char_pos
        end_pos = start_pos + len(elem_html)
        char_pos = end_pos
        
        paragraphs.append((para_index, text, start_pos, end_pos))
        para_index += 1
    
    return paragraphs


async def store_paragraph_embeddings(paragraphs: List[ParagraphEmbedding]) -> int:
    """
    Store paragraph embeddings in Supabase.
    Returns number of embeddings stored.
    """
    if not paragraphs:
        return 0
    
    records = []
    for p in paragraphs:
        records.append({
            'document_id': p.document_id,
            'user_id': p.user_id,
            'folder_id': p.folder_id,
            'paragraph_index': p.paragraph_index,
            'paragraph_text': p.paragraph_text,
            'embedding': p.embedding,
            'char_start': p.char_start,
            'char_end': p.char_end,
        })
    
    try:
        result = supabase.table('document_embeddings').upsert(
            records,
            on_conflict='document_id,paragraph_index'
        ).execute()
        return len(result.data) if result.data else 0
    except Exception as e:
        print(f"[Embedding] Failed to store embeddings: {e}")
        return 0


async def find_similar_paragraphs(
    target_embedding: List[float],
    class_folder_id: str,
    exclude_document_id: str,
    similarity_threshold: float = 0.80,
    max_results: int = 10
) -> List[SimilarityMatch]:
    """
    Find similar paragraphs within a class folder using pgvector cosine similarity.
    """
    try:
        result = supabase.rpc('find_similar_paragraphs', {
            'target_embedding': target_embedding,
            'class_folder_id': class_folder_id,
            'exclude_document_id': exclude_document_id,
            'similarity_threshold': similarity_threshold,
            'max_results': max_results
        }).execute()
        
        matches = []
        for row in result.data or []:
            matches.append(SimilarityMatch(
                embedding_id=row['embedding_id'],
                document_id=row['document_id'],
                user_id=row['user_id'],
                paragraph_index=row['paragraph_index'],
                paragraph_text=row['paragraph_text'],
                similarity=row['similarity']
            ))
        return matches
    except Exception as e:
        print(f"[Similarity] Search failed: {e}")
        return []


async def process_document_for_embeddings(
    document_id: str,
    html_content: str,
    user_id: str,
    folder_id: Optional[str] = None
) -> int:
    """
    Full pipeline: extract paragraphs, generate embeddings, store in Supabase.
    Returns number of embeddings created.
    """
    # Extract paragraphs
    paragraphs_data = extract_paragraphs(html_content)
    if not paragraphs_data:
        return 0
    
    # Generate embeddings
    texts = [p[1] for p in paragraphs_data]
    embeddings = await generate_embeddings_batch(texts)
    
    # Build paragraph embedding objects
    paragraphs = []
    for (para_idx, text, char_start, char_end), embedding in zip(paragraphs_data, embeddings):
        paragraphs.append(ParagraphEmbedding(
            document_id=document_id,
            user_id=user_id,
            folder_id=folder_id,
            paragraph_index=para_idx,
            paragraph_text=text,
            embedding=embedding,
            char_start=char_start,
            char_end=char_end,
        ))
    
    # Store in database
    return await store_paragraph_embeddings(paragraphs)


# CLI entry point for batch processing
async def main():
    """Process all documents in a class folder for embeddings."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python embedding_service.py <folder_id>")
        sys.exit(1)
    
    folder_id = sys.argv[1]
    print(f"[Embedding] Processing folder: {folder_id}")
    
    # Get all documents in folder
    result = supabase.table('documents').select('id, content, user_id').eq('folder_id', folder_id).execute()
    documents = result.data or []
    
    print(f"[Embedding] Found {len(documents)} documents")
    
    total_embeddings = 0
    for doc in documents:
        count = await process_document_for_embeddings(
            document_id=doc['id'],
            html_content=doc['content'],
            user_id=doc['user_id'],
            folder_id=folder_id
        )
        total_embeddings += count
        print(f"  Document {doc['id']}: {count} embeddings")
    
    print(f"[Embedding] Complete. Total embeddings: {total_embeddings}")


if __name__ == '__main__':
    asyncio.run(main())