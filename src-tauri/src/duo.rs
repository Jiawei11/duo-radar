//! Product boundary for Jiawei's Duo-only application.
use apw_core::{catalog::Catalog, config::Settings, model::Product};

pub fn allowed(product: &Product) -> bool {
    product.family == "iphoneduo"
        && ["Star White", "Night Sky"].contains(&product.color.as_str())
        && ["256GB", "512GB", "1TB", "2TB"].contains(&product.capacity.as_str())
}

pub fn restrict(settings: &mut Settings, catalog: &Catalog) {
    settings.locale = "en_US".into();
    settings.delivery_region = None;
    settings.checkout.enabled = false;
    settings.checkout.place_order = false;
    let products = catalog.products("en_US").unwrap_or_default();
    settings.targets.retain(|t| {
        t.locale == "en_US"
            && products
                .iter()
                .any(|p| allowed(p) && p.part_number == t.part_number)
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exactly_eight_duo_variants_and_legacy_checkout_is_disabled() {
        let catalog = Catalog::new();
        let products = catalog.products("en_US").unwrap();
        let selected: Vec<_> = products.iter().filter(|p| allowed(p)).collect();
        assert_eq!(selected.len(), 8);
        for color in ["Star White", "Night Sky"] {
            for capacity in ["256GB", "512GB", "1TB", "2TB"] {
                assert_eq!(
                    selected
                        .iter()
                        .filter(|p| p.color == color && p.capacity == capacity)
                        .count(),
                    1
                );
            }
        }
        let mut settings = Settings::default();
        settings.checkout.enabled = true;
        restrict(&mut settings, &catalog);
        assert!(!settings.checkout.enabled);
        assert!(settings.delivery_region.is_none());
        assert_eq!(settings.locale, "en_US");
    }
}
