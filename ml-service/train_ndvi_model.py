"""
AgriShield Parametric - Module 8
CLI Entry Point: Train and Evaluate NDVI Forecast Model from AgriVision Dataset

Usage:
    python train_ndvi_model.py [--dataset-path PATH] [--artifacts-dir PATH]
"""

import argparse
import os
import sys

# Ensure ml-service root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ndvi_training_service import (
    NdviModelHyperparameters,
    load_and_preprocess_dataset,
    train_and_save_final_model,
)
from app.utils.logger import logger


def main():
    parser = argparse.ArgumentParser(description="Train AgriShield NDVI Forecast Model")
    parser.add_argument(
        "--dataset-path",
        type=str,
        default=r"D:\AgriShield_Datasets\AgriVision_IEEE_Dataset-main\primary\AgriVision_Maharashtra_ML_Features_GSMaP_2017_2025.csv",
        help="Path to the primary AgriVision dataset CSV",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts"),
        help="Target directory for trained artifacts",
    )
    args = parser.parse_args()

    logger.info("================================================================================")
    logger.info("AgriShield Module 8: NDVI Forecast Model Training Pipeline")
    logger.info("================================================================================")

    # 1. Load & Preprocess
    df = load_and_preprocess_dataset(args.dataset_path)

    # 2. Train, Evaluate & Persist
    hyperparams = NdviModelHyperparameters(
        max_iter=100,
        learning_rate=0.08,
        max_depth=6,
        min_samples_leaf=20,
        l2_regularization=1.0,
        random_state=42,
    )

    results = train_and_save_final_model(
        df=df,
        hyperparams=hyperparams,
        save_dir=args.artifacts_dir,
    )

    logger.info("Training and evaluation completed successfully!")
    logger.info(f"Model artifact saved to: {results['model_path']}")
    logger.info(f"Metadata saved to: {results['metadata_path']}")

    # Print summary of evaluation
    chrono = results["metadata"]["chronological_evaluation"]
    logger.info("--- Chronological Evaluation (Train 2017-2023, Test 2024-2025) ---")
    logger.info(f"Historical Mean Baseline: {chrono['baselines']['historical_mean']}")
    logger.info(f"Persistence Baseline:     {chrono['baselines']['persistence']}")
    logger.info(f"HistGradientBoosting:     {chrono['model_performance']}")
    logger.info(f"Relative Improvement:     {chrono['relative_improvement_vs_persistence']}")


if __name__ == "__main__":
    main()
