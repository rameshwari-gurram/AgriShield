from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseMLModel(ABC):
    """
    Abstract Base Class architecture for AgriShield ML Models.
    Future models (Crop-Stress, Drought Risk, SHAP Explainer) will inherit from this base.
    No model logic is implemented in Module 1.
    """

    def __init__(self, model_name: str, version: str):
        self.model_name = model_name
        self.version = version
        self.is_loaded = False

    @abstractmethod
    def load(self, model_path: str) -> None:
        """Load trained weights/artifacts from disk or remote storage."""
        pass

    @abstractmethod
    def predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Generate prediction score / risk probability."""
        pass

    @abstractmethod
    def explain(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Compute SHAP feature importances for transparency."""
        pass
