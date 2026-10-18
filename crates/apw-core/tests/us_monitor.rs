use apw_core::apple::parse_pickup_message;
use apw_core::catalog::Catalog;
use apw_core::model::{Availability, region_by_locale};

#[test]
fn us_region_catalog_and_texas_locations_are_valid() {
    let region = region_by_locale("en_US").unwrap();
    assert_eq!(
        region.pickup_message_url(),
        "https://www.apple.com/shop/retail/pickup-message"
    );
    assert_eq!(
        region.education_bag_url(),
        "https://www.apple.com/us-edu/shop/bag"
    );
    let catalog = Catalog::new();
    let products = catalog.products("en_US").unwrap();
    assert!(products.iter().any(|p| p.part_number == "MG484LL/A"));
    // All requested metro stores, including the nearby suburbs.
    for number in [
        "R144", "R042", "R746", "R151", "R316", "R216", "R085", "R058", "R164", "R321", "R437",
        "R204", "R205", "R126",
    ] {
        let store = catalog.store_by_number("en_US", number).unwrap();
        let location = store.pickup_location("en_US").unwrap();
        assert_eq!(location.len(), 5, "{} must use its ZIP", store.title);
        assert!(location.chars().all(|c| c.is_ascii_digit()));
        assert!(store.title.contains(&store.city));
    }
}

#[test]
fn actual_texas_responses_parse_with_existing_engine() {
    for (raw, number) in [
        (
            include_bytes!("../../../research/pickup-dallas.json").as_slice(),
            "R144",
        ),
        (
            include_bytes!("../../../research/pickup-austin.json").as_slice(),
            "R216",
        ),
        (
            include_bytes!("../../../research/pickup-houston.json").as_slice(),
            "R058",
        ),
    ] {
        let result = parse_pickup_message(raw, number).unwrap();
        assert_eq!(result.store_number, number);
        let status = result.parts.get("MG484LL/A").unwrap();
        assert_eq!(status.availability, Availability::InStock);
        assert_eq!(
            status.product_title.as_deref(),
            Some("iPhone 17 256GB Mist Blue")
        );
        // This fixture records one check, not a promise of current inventory.
        assert!(
            status
                .pickup_details
                .as_ref()
                .unwrap()
                .pickup_quote
                .is_some()
        );
    }
}
