use rkyv::{Archive, Deserialize};

pub fn serialize<T>(value: &T) -> std::io::Result<Vec<u8>>
where
    T: rkyv::Serialize<rkyv::ser::serializers::AllocSerializer<256>>,
{
    rkyv::to_bytes::<T, 256>(value)
        .map(|v| v.to_vec())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Serialization error: {}", e)))
}

pub fn deserialize<T>(bytes: &[u8]) -> std::io::Result<T>
where
    T: Archive,
    T::Archived: for<'a> rkyv::CheckBytes<rkyv::validation::validators::DefaultValidator<'a>>
        + Deserialize<T, rkyv::de::deserializers::SharedDeserializeMap>,
{
    rkyv::from_bytes(bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, format!("Deserialization error: {}", e)))
}
