import os
import logging
from flask import Flask, request, jsonify
from sentence_transformers import CrossEncoder

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize reranker
MODEL_NAME = os.getenv('MODEL_ID', 'BAAI/bge-reranker-v2-m3')
logger.info(f"Loading model: {MODEL_NAME}")
reranker = CrossEncoder(MODEL_NAME, max_length=512)
logger.info("Model loaded successfully")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route('/rerank', methods=['POST'])
def rerank():
    try:
        logger.info("Received rerank request")
        data = request.get_json()

        if not data:
            logger.error("No JSON data in request")
            return jsonify({"error": "No JSON data provided"}), 400

        query = data.get('query')
        texts = data.get('texts', [])

        logger.info(f"Query: {query}, Texts count: {len(texts)}")

        if not query or not texts:
            return jsonify({"error": "query and texts are required"}), 400

        # Create pairs for reranking
        pairs = [[query, text] for text in texts]
        logger.info(f"Created {len(pairs)} pairs for reranking")

        # Get scores
        logger.info("Computing scores...")
        try:
            scores = reranker.predict(pairs)
            logger.info(f"Scores computed successfully: {len(scores)} scores")
        except Exception as score_error:
            logger.error(f"Error computing scores: {score_error}", exc_info=True)
            raise

        # Create results
        results = [
            {"index": i, "score": float(score)}
            for i, score in enumerate(scores)
        ]

        logger.info(f"Returning {len(results)} results")
        return jsonify(results), 200

    except Exception as e:
        logger.error(f"Error in rerank: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, threaded=True)
