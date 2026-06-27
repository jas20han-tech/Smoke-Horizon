def get_boundary_layer_multiplier(pblh: float, ref_height: float = 700.0) -> float:
    """
    Calculate a concentration multiplier based on Planetary Boundary Layer Height (PBLH).
    A lower boundary layer compresses the volume of air, trapping pollutants at ground level.
    A higher boundary layer allows smoke to disperse vertically, reducing ground-level PM2.5.
    
    Formula: Multiplier = Ref_Height / PBLH
    We clamp the multiplier between 0.35 (high mixing) and 2.5 (strong trapping/inversion).
    """
    if pblh <= 0:
        return 2.5
        
    multiplier = ref_height / pblh
    
    # Bound the results to keep the physical model stable
    return max(0.35, min(2.5, multiplier))
