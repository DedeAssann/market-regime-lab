# Market Regime Lab

Tableau de bord visuel et pédagogique de détection des régimes de marché pour **EUR/USD en M30, H1 et H4**.

## Ce que montre la V0

- le prix et l'EMA 50, avec le régime en arrière-plan ;
- une frise temporelle des changements de régime ;
- l'espace des états : pente de l'EMA normalisée par l'ATR contre RSI ;
- la volatilité encodée par la couleur ;
- une explication lisible de la dernière classification.

Le système n'envoie aucun ordre. Il travaille uniquement sur les bougies clôturées de l'intervalle choisi.

## Lancer localement

```bash
python scripts/update_data.py --demo
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

Tests du moteur :

```bash
python -m unittest discover -s tests -v
```

## Activer les données Twelve Data

1. Créer une clé API Twelve Data.
2. Dans GitHub : **Settings → Secrets and variables → Actions**.
3. Ajouter un secret nommé `TWELVE_DATA_API_KEY`.
4. Dans **Settings → Pages**, choisir **GitHub Actions** comme source.
5. Lancer manuellement le workflow une première fois.

Le workflow s'exécute ensuite à 7 et 37 minutes après chaque heure, du lundi au vendredi. Cette marge permet de récupérer la dernière bougie M30 clôturée ; GitHub Actions peut occasionnellement démarrer plus tard.

## Important

Cette version est un outil d'analyse et d'apprentissage. Les seuils de régime sont des hypothèses explicites à tester hors échantillon avant toute utilisation en paper trading.
